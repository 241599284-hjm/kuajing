"use client";

import { useEffect, useState } from "react";

export type CustomerSession = {
  customerId: string;
  email: string;
  username: string;
};

const accountStorageKey = "demo-teaware-customer";
const customerChangedEvent = "demo-teaware-customer-changed";

export function readCustomerSession(): CustomerSession | null {
  try {
    const storedCustomer = window.localStorage.getItem(accountStorageKey);
    return storedCustomer ? (JSON.parse(storedCustomer) as CustomerSession) : null;
  } catch {
    window.localStorage.removeItem(accountStorageKey);
    return null;
  }
}

export function writeCustomerSession(customer: CustomerSession) {
  window.localStorage.setItem(accountStorageKey, JSON.stringify(customer));
  window.dispatchEvent(new Event(customerChangedEvent));
}

export function clearCustomerSession() {
  window.localStorage.removeItem(accountStorageKey);
  window.dispatchEvent(new Event(customerChangedEvent));
}

export function useCustomerSession() {
  const [customer, setCustomer] = useState<CustomerSession | null>(null);

  useEffect(() => {
    function refreshCustomer() {
      setCustomer(readCustomerSession());
    }

    refreshCustomer();
    window.addEventListener(customerChangedEvent, refreshCustomer);
    window.addEventListener("storage", refreshCustomer);

    return () => {
      window.removeEventListener(customerChangedEvent, refreshCustomer);
      window.removeEventListener("storage", refreshCustomer);
    };
  }, []);

  return customer;
}
