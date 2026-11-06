import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import StockAdjustmentForm from "./StockAdjustmentForm";
import { usePermissions } from "@/api/usePermissions.js";

export default function CreateStockAdjustment(){
  const navigate = useNavigate();

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("stock-adjustment") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  const onSubmit = async (payload) => {
    if (!can.create) {
      toast.error("You don't have permission to create stock adjustments.");
      return;
    }
    try {
      const { data } = await axios.post("/api/stock-adjustments", payload);
      toast.success("Stock adjustment created");
      navigate(data?.id ? `/stock-adjustments/${data.id}` : "/stock-adjustments");
    } catch (e) {
      const msg = e?.response?.data?.message || "Create failed";
      toast.error(msg);
    }
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.create) return <div className="p-6 text-sm text-gray-700">You don’t have permission to create stock adjustments.</div>;

  return (
    <div className="stock-adjustment-page space-y-4">
      <StockAdjustmentForm onSubmit={onSubmit} onSuccess={()=>navigate('/stock-adjustments')} />
    </div>
  );
}
