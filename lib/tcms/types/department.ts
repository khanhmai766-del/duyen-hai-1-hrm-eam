export type Department = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentInput = Pick<Department, "code" | "name" | "active">;
