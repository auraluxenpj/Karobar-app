import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import SaleInvoiceRetailForm from "./SaleInvoiceRetailForm.jsx";
import { usePermissions } from "@/api/usePermissions.js";

export default function CreateSaleInvoiceRetail() {
  const navigate = useNavigate();

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("sale-invoice") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  const onSubmit = async (payload) => {
    if (!can.create) {
      toast.error("You don't have permission to create sale invoices.");
      return;
    }
    try {
      const { data } = await axios.post("/api/sale-invoices", payload);
      toast.success("Retail sale invoice created");
      navigate("/sale-invoices");
      return data;
    } catch (e) {
      const msg = e?.response?.data?.message || "Create failed";
      toast.error(msg);
    }
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.create) return <div className="p-6 text-sm text-gray-700">You don't have permission to create sale invoices.</div>;

  return (
    <div className="sale-entry-page">
      <SaleInvoiceRetailForm onSubmit={onSubmit} onSuccess={() => navigate("/sale-invoices")} />
    </div>
  );
}
