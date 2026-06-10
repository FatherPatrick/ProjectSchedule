import { BUSINESS_NAME } from "@/lib/config";
import { POLICIES } from "@/lib/policies";

export const metadata = { title: "Policies" };

export default function Policies() {
  return (
    <article className="prose max-w-none">
      <h1>Policies</h1>
      <p>
        <strong>Last updated:</strong> {new Date().toLocaleDateString()}
      </p>
      <p>
        To keep every appointment at {BUSINESS_NAME} smooth and relaxing, please
        review the policies below before your visit.
      </p>

      <ul>
        {POLICIES.map((policy) => (
          <li key={policy}>{policy}</li>
        ))}
      </ul>
    </article>
  );
}
