import { createFileRoute } from "@tanstack/react-router";
import { UnauthorizedPanel } from "@/components/AuthProvider";

export const Route = createFileRoute("/unauthorized")({
  component: UnauthorizedPanel,
});
