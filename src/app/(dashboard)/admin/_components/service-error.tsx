import type { ServiceError } from "@/server/services";
import { Card, CardContent, CardHeader, CardTitle } from "./ui";

export function ServiceErrorCard({ error }: { error: ServiceError }) {
  const hint =
    error.code === "unauthorized" || error.code === "forbidden"
      ? "ต้องเข้าสู่ระบบด้วยสิทธิ์เจ้าของ · Owner sign-in required."
      : error.code === "db"
        ? "ตรวจฐานข้อมูล / การเปิด schema \"app\" สำหรับ RPC · Check the DB and that the app schema is exposed for RPCs."
        : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>เกิดข้อผิดพลาด · Error</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-sm text-red-600">
          [{error.code}] {error.message}
        </p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
