import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import SaleInvoiceRetailForm from "./SaleInvoiceRetailForm.jsx";
import SaleInvoiceWholesaleForm from "./SaleInvoiceWholesaleForm.jsx";
import { usePermissions, Guard } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";

export default function EditSaleInvoice() {
  const { id } = useParams();
  const navigate = useNavigate();

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("sale-invoice") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState(null);
  const [saleType, setSaleType] = useState(null);

  useEffect(() => { document.title = "Edit Sale Invoice - Pharmacy ERP"; }, []);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`/api/sale-invoices/${id}`);
        setInitial(data);
        // Determine sale type from the fetched data
        setSaleType(data.sale_type || "retail");
        setFetchErr(null);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 403) setFetchErr("You don't have permission to view this invoice.");
        else if (status === 404) setFetchErr("Invoice not found.");
        else setFetchErr("Failed to load invoice.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, permsLoading, can.view]);

  const onSubmit = async (payload) => {
    if (!can.update) {
      toast.error("You don't have permission to update sale invoices.");
      return;
    }
    try {
      const { data } = await axios.post(`/api/sale-invoices/${id}?_method=PUT`, payload);
      toast.success("Sale invoice updated");
      navigate("/sale-invoices");
      return data;
    } catch (e) {
      const msg = e?.response?.data?.message || "Update failed";
      toast.error(msg);
    }
  };

  if (permsLoading) return <PageSkeleton />;
  if (!can.view) return <div className="p-6 text-sm text-gray-700">You don't have permission to view sale invoices.</div>;
  if (loading) return <PageSkeleton />;
  if (fetchErr) return <div className="p-6 text-red-600">{fetchErr}</div>;

  // Render the appropriate form based on sale type
  const isWholesale = saleType === "wholesale";

  return (
    <div className="sale-entry-page">
      <Guard when={can.update}>
        {isWholesale ? (
          <SaleInvoiceWholesaleForm
            saleId={id}
            onSubmit={onSubmit}
            onSuccess={(data, savedId) => {
              const targetId = savedId || data?.id || id;
              navigate(`/wholesale-invoices/${targetId}`);
            }}
          />
        ) : (
          <SaleInvoiceRetailForm
            saleId={id}
            onSubmit={onSubmit}
            onSuccess={() => navigate("/sale-invoices")}
          />
        )}
      </Guard>
      {!can.update && (
        <div className="text-sm text-gray-700">
          You don't have permission to update sale invoices.
        </div>
      )}
    </div>
  );
}

