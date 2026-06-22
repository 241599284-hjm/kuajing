import { assertMaintenanceToken, scheduleProcessRestart } from "@commerce/ops-maintenance";

export async function POST(request: Request) {
  try {
    assertMaintenanceToken(
      request.headers.get("x-ops-maintenance-token") ?? "",
      process.env.OPS_MAINTENANCE_TOKEN ?? ""
    );
    scheduleProcessRestart();
    return Response.json({ accepted: true }, { status: 202 });
  } catch {
    return Response.json({ message: "maintenance request rejected" }, { status: 401 });
  }
}
