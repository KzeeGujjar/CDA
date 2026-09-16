import type { UaeBank } from "@/types/bank-evaluation";

export const BANK_EVALUATION_FEE_AED = 300;

export const uaeBanks: UaeBank[] = [
  { code: "adib", name: "Abu Dhabi Islamic Bank", shortName: "ADIB" },
  { code: "adcb", name: "Abu Dhabi Commercial Bank", shortName: "ADCB" },
  { code: "eib", name: "Emirates Islamic Bank", shortName: "EIB" },
  { code: "enbd", name: "Emirates NBD", shortName: "ENBD" },
  { code: "dib", name: "Dubai Islamic Bank", shortName: "DIB" },
  { code: "fab", name: "First Abu Dhabi Bank", shortName: "FAB" },
  { code: "al_hilal", name: "Al Hilal Bank", shortName: "Al Hilal Bank" },
  { code: "al_mashreq", name: "Mashreq Bank", shortName: "Al Mashreq Bank" },
];
