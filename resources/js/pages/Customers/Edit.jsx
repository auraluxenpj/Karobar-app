import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  UsersIcon,
  BellAlertIcon,
  EyeIcon,
} from "@heroicons/react/24/solid";
import CustomerForm from "./CustomerForm.jsx";
import RegularRefillReminderModal from "@/components/RegularRefillReminderModal.jsx";
import { usePermissions } from "@/api/usePermissions.js";
import PageSkeleton from "@/components/PageSkeleton.jsx";

export default function EditCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(false);

  const { loading: permsLoading, canFor } = usePermissions();
  const can = useMemo(
    () =>
      typeof canFor === "function"
        ? canFor("customer")
        : { view: false, create: false, update: false, delete: false },
    [canFor]
  );

  useEffect(() => {
    document.title = "Edit Customer - Karobar App";
  }, []);

  useEffect(() => {
    if (permsLoading || !can.view) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`/api/customers/${id}`);
        setCustomer(data);
        setFetchErr(null);
      } catch (err) {
        if (err?.response?.status === 404) setFetchErr("Customer not found.");
        else setFetchErr("Failed to load customer details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, permsLoading, can.view]);

  const handleUpdate = async (payload) => {
    if (!can.update) {
      toast.error("You don't have permission to update customers.");
      return;
    }
    if (!(payload.name || "").trim()) {
      toast.error("Customer name is required.");
      return;
    }
    try {
      setSaving(true);
      await axios.put(`/api/customers/${id}`, payload);
      toast.success("Customer updated");
      navigate("/customers");
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.errors?.name?.[0] ||
        err?.response?.data?.errors?.email?.[0] ||
        "Failed to update customer";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (permsLoading || loading) return <PageSkeleton />;
  if (!can.view) {
    return (
      <div className="p-6 text-sm text-gray-700">
        You don&apos;t have permission to view customers.
      </div>
    );
  }
  if (fetchErr) return <div className="p-6 text-red-600">{fetchErr}</div>;

  return (
    <div className="product-form-page space-y-4">
      <div className="products-panel">
        <div className="products-heading">
          <div className="flex items-center gap-3 min-w-0">
            <div className="products-identity-icon">
              <UsersIcon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="products-title">
                Edit Customer — {customer?.name}
              </h1>
              <p className="products-subtitle">
                Update customer details, credit terms & recurring medicine/product reminder schedule
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to="/customers" className="products-action theme-btn-secondary">
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              <span>Back to Customers</span>
            </Link>

            <Link
              to={`/customers/${id}`}
              className="products-action theme-btn-secondary"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              <span>View Details</span>
            </Link>

            {customer?.is_regular && (
              <button
                type="button"
                onClick={() => setReminderOpen(true)}
                className="products-action bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
              >
                <BellAlertIcon className="w-4 h-4" />
                <span>Send WhatsApp Reminder</span>
              </button>
            )}

            <button
              type="submit"
              form="customer-form"
              disabled={saving || !can.update}
              className="products-action products-action-primary theme-btn-primary"
            >
              <PencilSquareIcon className="w-4 h-4" />
              <span>{saving ? "Updating..." : "Update Customer"}</span>
            </button>
          </div>
        </div>
      </div>

      <CustomerForm
        initialData={customer}
        onSubmit={handleUpdate}
        saving={saving}
        isEdit={true}
        submitLabel="Update Customer"
      />

      <RegularRefillReminderModal
        open={reminderOpen}
        customer={customer}
        onClose={() => setReminderOpen(false)}
        onSent={(updatedCustomer) => {
          if (updatedCustomer) {
            setCustomer(updatedCustomer);
          }
        }}
      />
    </div>
  );
}

