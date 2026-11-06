import React, { useEffect, useMemo } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon, PlusCircleIcon } from "@heroicons/react/24/solid";
import ProductForm from "./ProductForm";
import { usePermissions } from "@/api/usePermissions.js";

export default function CreateProduct() {
  const navigate = useNavigate();
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () => (typeof canFor === "function" ? canFor("product") : {
      view:false, create:false, update:false, delete:false, import:false, export:false
    }),
    [canFor]
  );

  useEffect(() => { document.title = "Add Product - Pharmacy ERP"; }, []);

  const handleCreate = async (formData) => {
    if (!can.create) {
      toast.error("You don't have permission to create products.");
      return;
    }
    try {
      await axios.post("/api/products", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Product created");
      navigate("/products");
    } catch (e) {
      const msg = e?.response?.data?.message || "Create failed";
      toast.error(msg);
    }
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.create) return <div className="p-6 text-sm text-gray-700">You don't have permission to add products.</div>;

  return (
    <div className="product-form-page">
      <div className="products-panel">
        <div className="products-heading">
          {/* Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <PlusCircleIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Add Product</h1>
              <p className="products-subtitle">
                <span className="truncate">Create a new product for your inventory</span>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/products"
              title="Back to products (Ctrl+B)"
              className="products-action theme-btn-secondary"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              <span>Back to Products</span>
            </Link>

            <button
              id="save-product-btn-top"
              type="submit"
              form="product-form"
              title="Save (Ctrl+S)"
              className="products-action products-action-primary theme-btn-primary"
            >
              <PlusCircleIcon className="w-4 h-4" />
              <span>Save Product</span>
            </button>

            <kbd className="product-form-shortcut">
              Ctrl+S
            </kbd>
          </div>
        </div>
      </div>

      {/* Form */}
      <ProductForm onSubmit={handleCreate} />
    </div>
  );
}
