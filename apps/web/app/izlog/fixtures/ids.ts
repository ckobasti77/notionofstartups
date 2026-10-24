import type { Id, TableNames } from "@/convex/_generated/dataModel";

/** Stabilan lažni Convex id za fixture podatke izloga (nikad ne ide na server). */
export function fakeId<T extends TableNames>(table: T, n: number): Id<T> {
  return `${table}_${String(n).padStart(4, "0")}` as Id<T>;
}
