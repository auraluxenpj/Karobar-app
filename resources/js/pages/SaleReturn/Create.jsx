import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePermissions } from "@/api/usePermissions.js";
import SaleReturnForm from "./SaleReturnForm";

export default function CreateSaleReturn() {
  const navigate = useNavigate();

  // permissions
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("sale-return") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  const handleSuccess = () => {
    navigate("/sale-returns");
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.create) return <div className="p-6 text-sm text-gray-700">You don’t have permission to create sale returns.</div>;

  return (
    <div className="sale-return-page">
      <SaleReturnForm onSuccess={handleSuccess} />
    </div>
  );
}
