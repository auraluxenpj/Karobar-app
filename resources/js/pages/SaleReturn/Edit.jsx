import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import SaleReturnForm from "./SaleReturnForm";
import PageSkeleton from "@/components/PageSkeleton.jsx";

export default function EditSaleReturn() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("sale-return") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  useEffect(() => {
    if (permsLoading || !can.view) return; // only fetch when can.view
    const fetchReturn = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/api/sale-returns/${id}`);
        setInitialData(res.data);
        setFetchErr(null);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 403) setFetchErr("You don't have permission to view this sale return.");
        else if (status === 404) setFetchErr("Sale return not found.");
        else setFetchErr("Failed to fetch sale return.");
      } finally {
        setLoading(false);
      }
    };
    fetchReturn();
  }, [id, permsLoading, can.view]);

  const handleSuccess = () => {
    navigate("/sale-returns");
  };

  if (permsLoading) return <PageSkeleton />;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don’t have permission to view sale returns.</div>;
  if (loading) return <PageSkeleton />;
  if (fetchErr) return <div className="p-6 text-red-600">{fetchErr}</div>;

  return (
    <div className="sale-return-page">
      <Guard when={can.update}>
        <SaleReturnForm returnId={id} initialData={initialData} onSuccess={handleSuccess} />
      </Guard>
      {!can.update && (
        <div className="text-sm text-gray-700">You don’t have permission to update sale returns.</div>
      )}
    </div>
  );
}
