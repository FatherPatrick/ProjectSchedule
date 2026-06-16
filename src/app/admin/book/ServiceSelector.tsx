import { PrettySelect } from "@/components/PrettySelect";
import { Card } from "@/components/Card";

export function ServiceSelector({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Card as="fieldset" className="space-y-2">
      <legend className="px-2 text-sm font-medium">Service</legend>
      <PrettySelect
        value={value}
        onChange={onChange}
        ariaLabel="Service"
        triggerClassName="min-w-[18rem]"
        options={options}
      />
    </Card>
  );
}
