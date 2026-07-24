import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiCustomers } from '../api';
import type { Customer } from '../data/customers';

interface CustomersCtx {
  customers: Customer[];
  loading: boolean;
  addCustomer: (c: Omit<Customer, 'id'>) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  lookupKamRh: (customerName: string) => { kam: string; rh: string } | null;
}

const CustomersContext = createContext<CustomersCtx>({} as CustomersCtx);

export function CustomersProvider({ children }: { children: React.ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCustomers.getAll()
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, []);

  function addCustomer(c: Omit<Customer, 'id'>) {
    const newId = `C${String(customers.length + 1).padStart(3, '0')}`;
    const newC: Customer = { ...c, id: newId };
    setCustomers(prev => [...prev, newC]);
    apiCustomers.create(newC).catch(console.error);
  }

  function updateCustomer(id: string, updates: Partial<Customer>) {
    const updated = customers.map(c => c.id === id ? { ...c, ...updates } : c);
    setCustomers(updated);
    apiCustomers.bulkReplace(updated).catch(console.error);
  }

  function deleteCustomer(id: string) {
    setCustomers(prev => prev.filter(c => c.id !== id));
    apiCustomers.delete(id).catch(console.error);
  }

  function lookupKamRh(customerName: string) {
    const upper = customerName.toUpperCase();
    const found = customers.find(c => c.name.toUpperCase() === upper);
    return found ? { kam: found.kam, rh: found.rh } : null;
  }

  return (
    <CustomersContext.Provider value={{ customers, loading, addCustomer, updateCustomer, deleteCustomer, lookupKamRh }}>
      {children}
    </CustomersContext.Provider>
  );
}

export function useCustomers() { return useContext(CustomersContext); }
