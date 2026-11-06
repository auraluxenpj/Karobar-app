import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import StockAdjustmentForm from "./StockAdjustmentForm";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";

export default function EditStockAdjustment(){
  const { id } = useParams();
  const navigate = useNavigate();

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("stock-adjustment") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  useEffect(() => { document.title = "Edit Stock Adjustment - Pharmacy ERP"; }, []);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`/api/stock-adjustments/${id}`);
        setInitial(data);
        setFetchErr(null);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 403) setFetchErr("You don't have permission to view this adjustment.");
        else if (status === 404) setFetchErr("Adjustment not found.");
        else setFetchErr("Failed to load adjustment.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, permsLoading, can.view]);

  const onSubmit = async (payload) => {
    if (!can.update) {
      toast.error("You don't have permission to update stock adjustments.");
      return;
    }
    try {
      await axios.post(`/api/stock-adjustments/${id}?_method=PUT`, payload);
      toast.success("Stock adjustment updated");
      navigate(`/stock-adjustments/${id}`);
    } catch (e) {
      const msg = e?.response?.data?.message || "Update failed";
      toast.error(msg);
    }
  };

  if (permsLoading) return <PageSkeleton />;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don’t have permission to view stock adjustments.</div>;
  if (loading) return <PageSkeleton />;
  if (fetchErr) return <div className="p-6 text-red-600">{fetchErr}</div>;

  return (
    <div className="stock-adjustment-page stock-adjustment-edit space-y-4">
      <div className="flex justify-end">
        <Link to={`/stock-adjustments/${id}`} className="products-action theme-btn-tertiary"><ArrowLeftIcon className="w-5 h-5" aria-hidden="true" /><span>Back</span></Link>
      </div>

      <Guard when={can.update}>
        <StockAdjustmentForm
          adjustmentId={id}
          initialData={initial}
          onSubmit={onSubmit}
          onSuccess={()=>navigate(`/stock-adjustments/${id}`)}
        />
      </Guard>
      {!can.update && (
        <div className="text-sm text-gray-700">
          You don’t have permission to update stock adjustments.
        </div>
      )}
    </div>
  );
}
