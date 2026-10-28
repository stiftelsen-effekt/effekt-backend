/**
 * Analysis: the overview (collected this year, through time, open pledges against the 200 MNOK
 * milestone) and pledges (tilsagn), decided gifts that haven't arrived. Pledges are a separate
 * layer on top of the measured totals, never part of them.
 */
import { moneyInputError, parseMoneyInput } from "@/features/donations/form";
import { moneyToNumber } from "@/lib/money";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";

export type Overview = RouterOutputs["analysis"]["overview"];
export type Pledge = RouterOutputs["analysis"]["pledges"]["list"][number];
export type PledgeCreateInput = RouterInputs["analysis"]["pledges"]["create"];
export type PledgeReceivedInput = RouterInputs["analysis"]["pledges"]["markReceived"];

//region Overview

/** Percent of `whole`, 0–100. */
const percentOf = (part: string, whole: string) => {
  const w = moneyToNumber(whole);
  return w > 0 ? Math.min(Math.max((100 * moneyToNumber(part)) / w, 0), 100) : 0;
};

/**
 * Widths of the progress line to the milestone: measured (solid) from the left, open pledges
 * (hatched) after it, together never past 100 %.
 */
export function progress(overview: Overview) {
  const measured = percentOf(overview.throughTime.measured, overview.withPledges.milestone);
  const pledges = Math.min(
    percentOf(overview.pledges.open, overview.withPledges.milestone),
    100 - measured,
  );
  return { measured, pledges };
}

/** "200 MNOK" for 200 000 000. */
export function milestoneLabel(milestone: string) {
  const millions = moneyToNumber(milestone) / 1_000_000;
  return `${Number.isInteger(millions) ? millions : millions.toFixed(1).replace(".", ",")} MNOK`;
}

/** Ease-out: fast at first, settling on the value. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** The count-up's value `elapsed` ms into `duration`, in whole kroner. */
export function countUpValue(target: number, elapsed: number, duration: number) {
  if (elapsed >= duration) return target;
  return Math.round(target * easeOut(Math.max(elapsed, 0) / duration));
}

//endregion

//region Pledges

export const isOpen = (pledge: Pledge) => pledge.receivedDate === null;

export type PledgeForm = { sum: string; decidedDate: string };

export function validatePledge(form: PledgeForm) {
  return {
    sum: moneyInputError(form.sum),
    decidedDate: form.decidedDate ? undefined : "Enter the date it was decided",
  };
}

/** analysis.pledges.create input. Assumes validatePledge passed. */
export const pledgeCreateInput = (form: PledgeForm): PledgeCreateInput => ({
  sum: Number(parseMoneyInput(form.sum)!),
  decidedDate: form.decidedDate,
});

export type ReceivedForm = { receivedDate: string; donationId: string };

export function validateReceived(form: ReceivedForm) {
  const id = form.donationId.trim();
  return {
    receivedDate: form.receivedDate ? undefined : "Enter the date the money came in",
    donationId: id === "" || /^[1-9]\d*$/.test(id) ? undefined : "Enter a donation ID (digits)",
  };
}

/** analysis.pledges.markReceived input. Assumes validateReceived passed. */
export const receivedInput = (id: number, form: ReceivedForm): PledgeReceivedInput => ({
  id,
  receivedDate: form.receivedDate,
  donationId: form.donationId.trim() ? Number(form.donationId.trim()) : null,
});

//endregion
