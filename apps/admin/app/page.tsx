import { AdminWorkspace } from "./components/admin-workspace.js";
import { AdminAuthGate } from "./components/admin-auth-gate.js";

export default function AdminHomePage() {
  return <AdminAuthGate><AdminWorkspace /></AdminAuthGate>;
}
