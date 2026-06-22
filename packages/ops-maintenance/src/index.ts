import { timingSafeEqual } from "node:crypto";

function sameToken(received: string, expected: string) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export function assertMaintenanceToken(received: string, expected: string) {
  if (!expected) throw new Error("operations maintenance is not configured");
  if (!received || !sameToken(received, expected)) throw new Error("invalid operations maintenance token");
}

export function scheduleProcessRestart(
  schedule: (callback: () => void, delayMs: number) => unknown = setTimeout,
  exit: (code: number) => void = (code) => process.exit(code)
) {
  schedule(() => exit(0), 750);
}
