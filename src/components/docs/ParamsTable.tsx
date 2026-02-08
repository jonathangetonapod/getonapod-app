import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { type ApiParam } from "@/lib/api-docs";

interface ParamsTableProps {
  params: ApiParam[];
}

export function ParamsTable({ params }: ParamsTableProps) {
  if (params.length === 0) return null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[160px] font-semibold">Parameter</TableHead>
            <TableHead className="w-[100px] font-semibold">Type</TableHead>
            <TableHead className="w-[90px] font-semibold">Required</TableHead>
            <TableHead className="font-semibold">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {params.map((param) => (
            <TableRow key={param.name}>
              <TableCell className="font-mono text-sm">{param.name}</TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-mono text-xs">
                  {param.type}
                </Badge>
              </TableCell>
              <TableCell>
                {param.required ? (
                  <Badge variant="default" className="bg-purple-600 hover:bg-purple-600 text-xs">Yes</Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">No</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{param.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
