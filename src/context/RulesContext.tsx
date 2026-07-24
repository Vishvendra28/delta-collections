import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRules, apiExcludePatterns, apiCSE } from '../api';
import type { Rule, ExcludePattern, CompanyScopedExclude } from '../data/rules';

interface RulesCtx {
  rules: Rule[];
  excludePatterns: ExcludePattern[];
  companyScopedExcludes: CompanyScopedExclude[];
  loading: boolean;
  addRule: (rule: Omit<Rule, 'id' | 'createdAt'>) => void;
  updateRule: (id: string, updates: Partial<Rule>) => void;
  deleteRule: (id: string) => void;
  addExcludePattern: (ep: ExcludePattern) => void;
  updateExcludePattern: (pattern: string, updated: ExcludePattern) => void;
  deleteExcludePattern: (pattern: string) => void;
  addCompanyScopedExclude: (cse: Omit<CompanyScopedExclude, 'id'>) => void;
  updateCompanyScopedExclude: (id: string, updated: Omit<CompanyScopedExclude, 'id'>) => void;
  deleteCompanyScopedExclude: (id: string) => void;
}

const RulesContext = createContext<RulesCtx>({} as RulesCtx);

export function RulesProvider({ children }: { children: React.ReactNode }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [excludePatterns, setEPs] = useState<ExcludePattern[]>([]);
  const [companyScopedExcludes, setCSEs] = useState<CompanyScopedExclude[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiRules.getAll(), apiExcludePatterns.getAll(), apiCSE.getAll()])
      .then(([r, ep, cse]) => {
        setRules(r);
        setEPs(ep);
        setCSEs(cse);
      })
      .finally(() => setLoading(false));
  }, []);

  function addRule(rule: Omit<Rule, 'id' | 'createdAt'>) {
    const newRule: Rule = {
      ...rule,
      id: `R-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      source: rule.source || 'manual',
    };
    setRules(prev => [...prev, newRule]);
    apiRules.create(newRule).catch(console.error);
  }

  function updateRule(id: string, updates: Partial<Rule>) {
    setRules(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      const changed = updated.find(r => r.id === id);
      // Use single-row update — never touches other rules in the DB
      if (changed) apiRules.update(id, changed).catch(console.error);
      return updated;
    });
  }

  function deleteRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
    apiRules.delete(id).catch(console.error);
  }

  function addExcludePattern(ep: ExcludePattern) {
    const updated = [...excludePatterns, ep];
    setEPs(updated);
    apiExcludePatterns.bulkReplace(updated).catch(console.error);
  }

  function updateExcludePattern(pattern: string, updated: ExcludePattern) {
    const next = excludePatterns.map(ep => ep.pattern === pattern ? updated : ep);
    setEPs(next);
    apiExcludePatterns.bulkReplace(next).catch(console.error);
  }

  function deleteExcludePattern(pattern: string) {
    const next = excludePatterns.filter(ep => ep.pattern !== pattern);
    setEPs(next);
    apiExcludePatterns.bulkReplace(next).catch(console.error);
  }

  function addCompanyScopedExclude(cse: Omit<CompanyScopedExclude, 'id'>) {
    const newItem: CompanyScopedExclude = { ...cse, id: `CSE-${Date.now()}` };
    setCSEs(prev => [...prev, newItem]);
    apiCSE.create(newItem).catch(console.error);
  }

  function updateCompanyScopedExclude(id: string, updated: Omit<CompanyScopedExclude, 'id'>) {
    setCSEs(prev => prev.map(e => e.id === id ? { ...updated, id } : e));
    apiCSE.update(id, updated).catch(console.error);
  }

  function deleteCompanyScopedExclude(id: string) {
    setCSEs(prev => prev.filter(e => e.id !== id));
    apiCSE.delete(id).catch(console.error);
  }

  return (
    <RulesContext.Provider value={{ rules, excludePatterns, companyScopedExcludes, loading, addRule, updateRule, deleteRule, addExcludePattern, updateExcludePattern, deleteExcludePattern, addCompanyScopedExclude, updateCompanyScopedExclude, deleteCompanyScopedExclude }}>
      {children}
    </RulesContext.Provider>
  );
}

export function useRules() { return useContext(RulesContext); }
