import { Link } from "react-router";
import { Card } from "@/components/ui";

export default function Landing() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="max-w-lg p-8 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto mb-4 size-16" />
        <h1 className="text-2xl font-bold text-brand-800">Gia phả dòng họ</h1>
        <p className="mt-3 text-stone-700">
          Để xem cây gia phả, hãy mở đường link riêng mà người giữ gia phả của dòng họ đã gửi cho bạn.
        </p>
        <Link to="/admin/login" className="mt-6 inline-block text-[15px] text-brand-700 underline">
          Đăng nhập quản trị
        </Link>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-brand-800">Không tìm thấy trang</h1>
        <p className="mt-3 text-stone-700">Đường link có thể đã bị đổi. Hãy liên hệ người giữ gia phả để nhận link mới.</p>
      </Card>
    </div>
  );
}
