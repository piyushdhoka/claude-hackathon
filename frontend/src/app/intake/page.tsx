// Intake route — tap-only, multilingual, voice-guided wizard (LOST + FOUND).
// The wizard itself is a client component (camera, speech, local draft state).
import { IntakeWizard } from "@/components/intake/IntakeWizard";

export default function IntakePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <IntakeWizard />
    </div>
  );
}
