import type { ReactNode } from "react";

import { cn } from "./cn";

export type DataTableColumn<Row> = {
  align?: "left" | "right";
  cell: (row: Row) => ReactNode;
  className?: string;
  header: ReactNode;
  id: string;
};

type DataTableProps<Row> = {
  className?: string;
  columns: DataTableColumn<Row>[];
  rowKey: (row: Row) => string;
  rows: Row[];
};

export function DataTable<Row>({
  className,
  columns,
  rowKey,
  rows,
}: DataTableProps<Row>) {
  return (
    <div className={cn("ui-data-table", className)}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={column.className}
                data-align={column.align ?? "left"}
                key={column.id}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  className={column.className}
                  data-align={column.align ?? "left"}
                  key={column.id}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
