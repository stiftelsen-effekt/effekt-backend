import { HandCoinsIcon, KeyRoundIcon, UserIcon } from "lucide-react";
import { isDigits, type SearchProvider } from "@/features/search/providers";
import { formatDate, formatMoney } from "@/lib/format";
import { donations, donors } from "./fake-data";

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

/** Same contract as the API providers, over the fake data, so ⌘K works on /design. */
export const fakeSearchProviders: SearchProvider[] = [
  {
    id: "donors",
    group: "Donors",
    applies: (q) => q.trim().length >= 2,
    async search(query, signal) {
      await wait(120, signal);
      const q = query.trim().toLowerCase();
      return donors
        .filter(
          (d) => d.name.toLowerCase().includes(q) || d.email.includes(q) || String(d.id) === q,
        )
        .slice(0, 6)
        .map((d) => ({
          id: `donor-${d.id}`,
          title: d.name,
          subtitle: d.email,
          meta: `#${d.id}`,
          href: "/design/detail",
          icon: UserIcon,
        }));
    },
  },
  {
    id: "donation",
    group: "Donations",
    applies: isDigits,
    async search(query, signal) {
      await wait(180, signal);
      const match = donations.find((d) => String(d.id) === query.trim());
      return match
        ? [
            {
              id: `donation-${match.id}`,
              title: `Donation #${match.id}`,
              subtitle: `${match.donor} · ${formatDate(match.timestamp)}`,
              meta: formatMoney(match.sum),
              href: `/design/list?q=${match.id}`,
              icon: HandCoinsIcon,
            },
          ]
        : [];
    },
  },
  {
    id: "kid",
    group: "Distributions",
    applies: (q) => isDigits(q) && q.trim().length >= 5,
    async search(query, signal) {
      await wait(200, signal);
      return donations
        .filter((d) => d.kid.startsWith(query.trim()))
        .slice(0, 3)
        .map((d) => ({
          id: `kid-${d.kid}`,
          title: `KID ${d.kid}`,
          subtitle: d.donor,
          href: `/design/list?q=${d.kid}`,
          icon: KeyRoundIcon,
        }));
    },
  },
];

/** DonorPicker's search over the fake donors (same contract as donors.search). */
export async function fakeDonorSearch(query: string, signal: AbortSignal) {
  await wait(120, signal);
  const q = query.trim().toLowerCase();
  return donors
    .filter((d) => d.name.toLowerCase().includes(q) || d.email.includes(q) || String(d.id) === q)
    .slice(0, 8)
    .map(({ id, name, email }) => ({ id, name, email }));
}
