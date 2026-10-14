import type { T776Category } from "@prisma/client";

export type T776Line = {
  category: T776Category;
  line: string;
  label: string;
};

// Expense lines from CRA form T776, Statement of Real Estate Rentals.
export const T776_LINES: readonly T776Line[] = [
  { category: "ADVERTISING", line: "8521", label: "Advertising" },
  { category: "INSURANCE", line: "8690", label: "Insurance" },
  {
    category: "INTEREST_BANK_CHARGES",
    line: "8710",
    label: "Interest and bank charges",
  },
  { category: "OFFICE", line: "8810", label: "Office expenses" },
  {
    category: "PROFESSIONAL_FEES",
    line: "8860",
    label: "Legal, accounting, and other professional fees",
  },
  {
    category: "MANAGEMENT_FEES",
    line: "8871",
    label: "Management and administration fees",
  },
  {
    category: "REPAIRS_MAINTENANCE",
    line: "8960",
    label: "Repairs and maintenance",
  },
  {
    category: "SALARIES_WAGES",
    line: "9060",
    label: "Salaries, wages, and benefits",
  },
  { category: "PROPERTY_TAXES", line: "9180", label: "Property taxes" },
  { category: "TRAVEL", line: "9200", label: "Travel" },
  { category: "UTILITIES", line: "9220", label: "Utilities" },
  {
    category: "MOTOR_VEHICLE",
    line: "9281",
    label: "Motor vehicle expenses",
  },
  { category: "OTHER", line: "9270", label: "Other expenses" },
];
