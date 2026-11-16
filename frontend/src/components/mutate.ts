import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError, post } from "@/api/client";
import { useRefreshTree } from "@/api/hooks";
import { confirmDialog } from "./confirm";

export function useErrorHandler() {
  const refresh = useRefreshTree();
  const navigate = useNavigate();
  return (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.status === 401) {
        toast.error("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
        navigate("/admin/login");
        return;
      }
      if (e.code === "version_conflict" || e.code === "undo_conflict") {
        toast.error(e.message, { action: { label: "Tải lại", onClick: () => void refresh() }, duration: 12000 });
        void refresh();
        return;
      }
      toast.error(e.message);
      return;
    }
    toast.error("Đã có lỗi xảy ra");
    console.error(e);
  };
}

/**
 * Chạy một thao tác sửa: tự hỏi xác nhận khi máy chủ cảnh báo (FR-26),
 * làm mới cây và hiện "Đã lưu · Hoàn tác" trong 10 giây (FR-27).
 */
export function useMutate() {
  const refresh = useRefreshTree();
  const onError = useErrorHandler();

  const undo = async (batchId: string) => {
    try {
      await post(`/api/admin/batches/${batchId}/undo`);
      await refresh();
      toast.success("Đã hoàn tác");
    } catch (e) {
      onError(e);
    }
  };

  return async function run<T extends { batch_id?: string }>(
    message: string,
    fn: (confirmWarnings: boolean) => Promise<T>,
  ): Promise<T | null> {
    try {
      let result: T;
      try {
        result = await fn(false);
      } catch (e) {
        if (e instanceof ApiError && e.code === "warnings") {
          const ok = await confirmDialog({
            title: "Dữ liệu có điểm bất thường",
            message: "Vui lòng kiểm tra lại. Bạn vẫn muốn lưu?",
            list: e.warnings,
            confirmText: "Vẫn lưu",
          });
          if (!ok) return null;
          result = await fn(true);
        } else throw e;
      }
      await refresh();
      const batchId = result?.batch_id;
      toast.success(message, {
        duration: 10000,
        action: batchId ? { label: "Hoàn tác", onClick: () => void undo(batchId) } : undefined,
      });
      return result;
    } catch (e) {
      onError(e);
      return null;
    }
  };
}
