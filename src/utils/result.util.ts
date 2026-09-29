export type SectionStatus = "available" | "empty" | "failed";

export type DataSection<T> = {
  status: SectionStatus;
  data: T | null;
  reason: string | null;
};

export function available<T>(data: T): DataSection<T> {
  return { status: "available", data, reason: null };
}

export function empty<T>(data: T): DataSection<T> {
  return { status: "empty", data, reason: null };
}

export function failed<T>(reason: string): DataSection<T> {
  return { status: "failed", data: null, reason };
}

export function safeReason(error: unknown) {
  return error instanceof Error
    ? error.message.slice(0, 180)
    : "Unknown integration error";
}
