import { DOMParser, onErrorStopParsing } from "@xmldom/xmldom";
import * as xpath from "xpath";

export interface CamtTransaction {
  amount: number; // In SEK (not cents)
  externalReference: string;
  bookingDate: string; // YYYY-MM-DD format
  messages: string[]; // All remittance info for KID extraction
  donorName?: string; // For manual matching if KID not found
}

export interface CamtParseResult {
  postingDate: string;
  transactions: CamtTransaction[];
}

const CAMT_NAMESPACE = "urn:iso:std:iso:20022:tech:xsd:camt.053.001.02";

// DOM node as returned by @xmldom/xmldom / xpath. We only rely on textContent.
type XMLElement = Node;

/**
 * Parses an XML string into a DOM document.
 *
 * @xmldom/xmldom never resolves external entities or loads DTDs (no file or
 * network access), so the parser is not vulnerable to XXE. References to
 * entities other than the predefined XML ones are treated as errors. Any
 * parse error aborts parsing with an exception.
 */
function parseXml(xmlContent: string): Document {
  const doc = new DOMParser({ onError: onErrorStopParsing }).parseFromString(
    // libxml2 accepted (and ignored) a leading byte order mark
    xmlContent.replace(/^\uFEFF/, ""),
    "text/xml",
  );
  return doc as unknown as Document;
}

/**
 * Returns all nodes matching the XPath expression (namespace prefixes resolved from ns)
 */
function findAll(node: Node, expression: string, ns: Record<string, string>): XMLElement[] {
  const result = xpath.useNamespaces(ns)(expression, node);
  return xpath.isArrayOfNodes(result) ? result : [];
}

/**
 * Returns the first node matching the XPath expression, or null
 */
function findFirst(node: Node, expression: string, ns: Record<string, string>): XMLElement | null {
  return findAll(node, expression, ns)[0] ?? null;
}

/**
 * Helper function to get text content from an XPath result
 */
function getElementText(
  element: XMLElement,
  expression: string,
  ns: Record<string, string>,
): string {
  const result = findFirst(element, expression, ns);
  if (result) {
    return result.textContent || "";
  }
  return "";
}

/**
 * Parses an ISO 20022 CAMT.053 XML bank statement file
 * @param xmlContent The XML file content as a string
 * @returns Parsed transactions and posting date
 */
export function parseCamtFile(xmlContent: string): CamtParseResult {
  const doc = parseXml(xmlContent);
  const ns = { camt: CAMT_NAMESPACE };

  const transactions: CamtTransaction[] = [];

  // Get the statement
  const stmt = findFirst(doc, "//camt:Stmt", ns);
  if (!stmt) {
    throw new Error("No statement found in CAMT file");
  }

  // Get all entries (Ntry elements)
  const entries = findAll(doc, "//camt:Stmt/camt:Ntry", ns);

  for (const entry of entries) {
    // Check if this is a credit entry (only process credits)
    const creditDebitIndicator = getElementText(entry, "camt:CdtDbtInd", ns);
    if (creditDebitIndicator !== "CRDT") {
      continue; // Skip debit entries
    }

    // Get the booking date from the entry
    const bookingDate = getElementText(entry, "camt:BookgDt/camt:Dt", ns);

    // Check if this is an Autogiro payment (PMDD = Direct Debit)
    const subFamilyCode = getElementText(
      entry,
      "camt:BkTxCd/camt:Domn/camt:Fmly/camt:SubFmlyCd",
      ns,
    );

    // Get all transaction details within this entry (can be batched)
    const txDetails = findAll(entry, "camt:NtryDtls/camt:TxDtls", ns);

    // If no TxDtls, use the entry-level data
    if (txDetails.length === 0) {
      const entryAmount = parseFloat(getElementText(entry, "camt:Amt", ns) || "0");
      const entryRef = getElementText(entry, "camt:AcctSvcrRef", ns);

      // Skip Autogiro at entry level
      if (subFamilyCode === "PMDD") {
        continue;
      }

      // Get any unstructured remittance info at entry level
      const messages = extractMessagesFromEntry(entry, ns);

      // Skip Autogiro based on message content
      if (messages.some((m) => m.includes("AG Löpnr"))) {
        continue;
      }

      transactions.push({
        amount: entryAmount,
        externalReference: entryRef,
        bookingDate,
        messages,
      });
    } else {
      // Process each transaction detail separately (batch splitting)
      for (const txDetail of txDetails) {
        // Check SubFmlyCd at transaction level
        const txSubFamilyCode = getElementText(
          txDetail,
          "camt:BkTxCd/camt:Domn/camt:Fmly/camt:SubFmlyCd",
          ns,
        );

        // Skip Autogiro transactions
        if (txSubFamilyCode === "PMDD" || subFamilyCode === "PMDD") {
          continue;
        }

        // Extract transaction amount
        const txAmount = parseFloat(
          getElementText(txDetail, "camt:AmtDtls/camt:TxAmt/camt:Amt", ns) || "0",
        );

        // Extract external reference
        const txRef = getElementText(txDetail, "camt:Refs/camt:AcctSvcrRef", ns);

        // Extract donor name
        const donorName = getElementText(txDetail, "camt:RltdPties/camt:UltmtDbtr/camt:Nm", ns);

        // Extract all messages
        const messages = extractMessagesFromTxDetail(txDetail, ns);

        // Skip Autogiro based on message content
        if (messages.some((m) => m.includes("AG Löpnr"))) {
          continue;
        }

        transactions.push({
          amount: txAmount,
          externalReference: txRef,
          bookingDate,
          messages,
          donorName: donorName || undefined,
        });
      }
    }
  }

  // Get posting date from the first entry's booking date, or from statement creation date
  let postingDate = "";
  if (transactions.length > 0) {
    postingDate = transactions[0].bookingDate;
  } else {
    // Fallback to statement creation date
    const creationDateResult = findFirst(doc, "//camt:Stmt/camt:CreDtTm", ns);
    if (creationDateResult) {
      const creationDate = creationDateResult.textContent;
      if (creationDate) {
        postingDate = creationDate.split("T")[0]; // Extract date part
      }
    }
  }

  return {
    postingDate,
    transactions,
  };
}

/**
 * Extract messages from a TxDtls element
 */
function extractMessagesFromTxDetail(txDetail: XMLElement, ns: Record<string, string>): string[] {
  const messages: string[] = [];

  // Get unstructured remittance info
  const ustrdElements = findAll(txDetail, "camt:RmtInf/camt:Ustrd", ns);
  for (const ustrd of ustrdElements) {
    const text = ustrd.textContent?.trim();
    if (text) {
      messages.push(text);
    }
  }

  // Get structured remittance info (AddtlRmtInf)
  const addtlRmtInfoElements = findAll(txDetail, "camt:RmtInf/camt:Strd/camt:AddtlRmtInf", ns);
  for (const addtl of addtlRmtInfoElements) {
    const text = addtl.textContent?.trim();
    if (text) {
      messages.push(text);
    }
  }

  return messages;
}

/**
 * Extract messages from an Ntry element (when no TxDtls present)
 */
function extractMessagesFromEntry(entry: XMLElement, ns: Record<string, string>): string[] {
  const messages: string[] = [];

  // Get unstructured remittance info
  const ustrdElements = findAll(entry, "camt:NtryDtls/camt:RmtInf/camt:Ustrd", ns);
  for (const ustrd of ustrdElements) {
    const text = ustrd.textContent?.trim();
    if (text) {
      messages.push(text);
    }
  }

  // Get structured remittance info
  const addtlRmtInfoElements = findAll(
    entry,
    "camt:NtryDtls/camt:RmtInf/camt:Strd/camt:AddtlRmtInf",
    ns,
  );
  for (const addtl of addtlRmtInfoElements) {
    const text = addtl.textContent?.trim();
    if (text) {
      messages.push(text);
    }
  }

  return messages;
}

/**
 * Checks if a file content is a CAMT XML file
 */
export function isCamtXml(content: string): boolean {
  return content.trim().startsWith("<?xml") && content.includes("camt.053");
}
