import { useState } from "react";
import { Edit2 } from "react-feather";
import { TaxUnit } from "../../../../../models";
import { getFormattingLocale, thousandize } from "../../../../../util/formatting";
import { useMainLocale } from "../../../../../context/MainLocaleContext";

import { TaxUnitEditModal } from "../../TaxUnitModal/TaxUnitEditModal";
import { GenericList } from "../GenericList";
import { ListRow } from "../GenericListRow";

export const DKTaxUnitList: React.FC<{
  taxUnits: TaxUnit[];
  sumDonationsLabel: string;
  sumTaxDeductionsLabel: string;
  sumTaxBenefitLabel: string;
}> = ({ taxUnits, sumDonationsLabel, sumTaxDeductionsLabel, sumTaxBenefitLabel }) => {
  const formattingLocale = getFormattingLocale(useMainLocale());
  const formatKroner = (amount: number) =>
    thousandize(Math.round(amount), formattingLocale) + " kr";
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTaxUnit, setSelectedTaxUnit] = useState<TaxUnit | null>(null);

  const unit = taxUnits[0];

  const suplementalInformation =
    unit.ssn.length === 10
      ? unit.ssn.replace(/(\d{6})(\d{4})/, "$1-$2")
      : unit.ssn.replace(/(\d{4})(\d{4})/, "$1 $2");

  const headers = [
    {
      label: "",
      width: "10%",
    },
    {
      label: sumDonationsLabel,
      width: "30%",
    },
    {
      label: sumTaxDeductionsLabel,
      width: "30%",
    },
    {
      label: sumTaxBenefitLabel,
      width: "30%",
    },
  ];

  const filteredDeductions = unit.taxDeductions?.filter((d) => d.sumDonations > 0) || [];

  const contextOptions = [{ label: "Rediger", icon: <Edit2 size={16} /> }];

  const context = {
    contextOptions,
    onContextSelect: (option: string, element: TaxUnit) => {
      if (option === "Rediger") {
        setSelectedTaxUnit(element);
        setEditModalOpen(true);
      }
    },
  };

  const rows: ListRow<TaxUnit>[] = filteredDeductions.map((deductions, i) => {
    const row = {
      id: `${unit.id.toString()}${deductions.year}`,
      defaultExpanded: false,
      cells: [
        { value: deductions.year.toString() },
        { value: formatKroner(deductions.sumDonations) },
        { value: formatKroner(deductions.deduction) },
        { value: formatKroner(deductions.benefit) },
      ],
      element: unit,
    };

    if (i === 0) {
      return { ...row, ...context };
    }
    return row;
  });

  const countDonations = Math.round(
    filteredDeductions.reduce((acc, cur) => acc + cur.sumDonations, 0),
  );
  const totalsRow = {
    id: `${unit.id.toString()}total`,
    defaultExpanded: false,
    cells: [
      { value: "Totalt" },
      { value: formatKroner(countDonations) },
      {
        value: formatKroner(filteredDeductions.reduce((acc, cur) => acc + cur.deduction, 0)),
      },
      {
        value: formatKroner(filteredDeductions.reduce((acc, cur) => acc + cur.benefit, 0)),
      },
    ],
    element: unit,
  };

  rows.push(countDonations > 0 ? totalsRow : { ...totalsRow, ...context });

  const emptyPlaceholder = (
    <div>
      <div>Der mangler information for skatteenheden.</div>
      <div>
        Kontakt os på <a href={"mailto: donation@giveffektivt.dk"}>donation@giveffektivt.dk</a>.
      </div>
    </div>
  );

  return (
    <>
      <GenericList
        title={unit.name}
        supplementalInformation={suplementalInformation}
        headers={headers}
        rows={rows}
        emptyPlaceholder={emptyPlaceholder}
        expandable={false}
        proportions={[30, 60]}
      />
      {editModalOpen && selectedTaxUnit && (
        <TaxUnitEditModal
          open={editModalOpen}
          initial={selectedTaxUnit}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => setEditModalOpen(false)}
          onFailure={() => {}}
        />
      )}
    </>
  );
};
