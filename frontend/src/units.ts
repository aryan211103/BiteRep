// Unit conversions & formatting
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const lbsToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLbs = (kg: number) => kg / KG_PER_LB;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const cmToIn = (cm: number) => cm / CM_PER_IN;

export function fmtWeight(kg: number, system: 'imperial' | 'metric') {
  if (system === 'imperial') return `${Math.round(kgToLbs(kg))} lb`;
  return `${Math.round(kg)} kg`;
}

export function fmtHeight(cm: number, system: 'imperial' | 'metric') {
  if (system === 'imperial') {
    const totalIn = cmToIn(cm);
    const ft = Math.floor(totalIn / 12);
    const inc = Math.round(totalIn - ft * 12);
    return `${ft}′${inc}″`;
  }
  return `${Math.round(cm)} cm`;
}

export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateAdd(dateStr: string, delta: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function shortDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayNum(dateStr: string) {
  const d = new Date(dateStr);
  return d.getDate();
}
