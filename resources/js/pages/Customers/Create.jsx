import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  PlusCircleIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import CustomerForm from "./CustomerForm.jsx";
import { usePermissions } from "@/api/usePermissions.js";

export default function CreateCustomer() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      typeof canFor === "function"
        ? canFor("customer")
        : { view: false, create: false, update: false, delete: false },
    [canFor]
  );

  useEffect(() => {
    document.title = "Add Customer - Karobar App";
  }, []);

  const handleCreate = async (payload) => {
    if (!can.create) {
      toast.error("You don't have permission to create customers.");
      return;
    }
    if (!(payload.name || "").trim()) {
      toast.error("Customer name is required.");
      return;
    }
    try {
      setSaving(true);
      await axios.post("/api/customers", payload);
      toast.success("Customer created");
      navigate("/customers");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.name?.[0] ||
        err?.response?.data?.errors?.email?.[0] ||
        "Failed to create customer";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (permsLoading) return <div className="p-6">Loading…</div>;
  if (!can.create) {
    return (
      <div className="p-6 text-sm text-gray-700">
        You don&apos;t have permission to create customers.
      </div>
    );
  }

  return (
    <div className="product-form-page space-y-4">
      <div className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">Add Customer</h1>
              <p className="products-subtitle">
                Create a customer, configure credit terms & set up recurring monthly/weekly medicine reminders
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/customers" className="products-action theme-btn-secondary">
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              <span>Back to Customers</span>
            </Link>

            <button
              type="submit"
              form="customer-form"
              disabled={saving}
              className="products-action products-action-primary theme-btn-primary"
            >
              <PlusCircleIcon className="w-4 h-4" />
              <span>{saving ? "Saving..." : "Save Customer"}</span>
            </button>
          </div>
        </div>
      </div>

      <CustomerForm
        onSubmit={handleCreate}
        saving={saving}
        isEdit={false}
        submitLabel="Save Customer"
      />
    </div>
  );
}

