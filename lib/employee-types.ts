export const EMPLOYEE_TYPES = ["Employee", "Project Based", "Intern"] as const;
export type EmployeeType = typeof EMPLOYEE_TYPES[number];
export function isEmployeeType(value: unknown): value is EmployeeType {
    return typeof value === "string" && EMPLOYEE_TYPES.some((type) => type === value);
}
