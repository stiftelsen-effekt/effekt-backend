import { useAuth0 } from "@auth0/auth0-react";
import { useTrpcClient } from "../../../../lib/trpc/useTrpcClient";
import { useCallback, useState } from "react";
import AnimateHeight from "react-animate-height";
import { Check } from "react-feather";
import { toast } from "react-toastify";
import { TaxUnit } from "../../../../models";
import { EffektCheckbox } from "../../../shared/components/EffektCheckbox/EffektCheckbox";
import { Lightbox } from "../../../shared/components/Lightbox/Lightbox";
import { deleteTaxUnit } from "../../_queries";
import { TaxUnitSelector } from "../TaxUnitSelector/TaxUnitSelector";
import { TaxUnitCreateModal } from "./TaxUnitCreateModal";

import styles from "./TaxUnitModal.module.scss";
import { useFailureToast } from "../../../shared/failureToast";
import { canConfirmTaxUnitDelete } from "./canConfirmTaxUnitDelete";

export const TaxUnitDeleteModal: React.FC<{
  open: boolean;
  taxUnit: TaxUnit;
  onSuccess: (success: boolean) => void;
  onFailure: () => void;
  onClose: () => void;
}> = ({ open, taxUnit, onSuccess, onFailure, onClose }) => {
  const { getAccessTokenSilently, user } = useAuth0();
  const trpc = useTrpcClient(getAccessTokenSilently);
  const failureToast = useFailureToast();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTaxUnit, setSelectedTaxUnit] = useState<TaxUnit | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [transferDonations, setTransferDonations] = useState(false);

  // Moving the donations needs a unit to move them to; without one the unit would just be deleted
  const valid = canConfirmTaxUnitDelete(transferDonations, selectedTaxUnit);

  const deleteUnit = useCallback(async () => {
    if (!user || !canConfirmTaxUnitDelete(transferDonations, selectedTaxUnit)) {
      return;
    }

    setLoading(true);

    const transferUnit = transferDonations ? selectedTaxUnit : null;

    const result = await deleteTaxUnit({ unit: taxUnit, transferUnit: transferUnit }, user, trpc);

    if (result && typeof result !== "string") {
      successToast();
      onSuccess(result);
      setError("");
    } else if (typeof result === "string") {
      onFailure();
      failureToast();
      setLoading(false);
      setError(result);
    } else {
      onFailure();
      failureToast();
      setLoading(false);
      setError("");
    }
  }, [trpc, user, taxUnit, selectedTaxUnit, transferDonations, onSuccess, onFailure, failureToast]);

  return (
    <Lightbox open={open} onConfirm={deleteUnit} onCancel={onClose} loading={loading} valid={valid}>
      <div className={styles.container}>
        <h5>Slett skatteenhet</h5>

        <div className={styles.inputContainer}>
          {/** Show selector if tax unit has any donations for the current year */}
          <p>
            Du er i ferd med å slette skatteenheten <strong>{taxUnit.name}</strong>.
          </p>

          {/* oxlint-disable-next-line react/purity -- reads today's date for a label; recomputing it each render is intended */}
          {taxUnit.taxDeductions?.find((d) => d.year === new Date().getFullYear()) ? (
            <>
              <p>
                Denne skattenheten har donasjoner knyttet til seg for inneværende år. Dersom du
                ønsker kan du overføre disse donasjonene som vi ennå ikke har rapportert til
                skatteetaten til en annen skatteenhet.
              </p>

              <EffektCheckbox
                checked={transferDonations}
                onChange={(checked: boolean) => setTransferDonations(checked)}
              >
                Flytt donasjoner til annen skatteenhet
              </EffektCheckbox>
              <AnimateHeight duration={80} height={transferDonations ? "auto" : 0} animateOpacity>
                <div className={styles.selectorContainer}>
                  <TaxUnitSelector
                    selected={selectedTaxUnit}
                    exclude={[taxUnit]}
                    onChange={(unit) => setSelectedTaxUnit(unit)}
                    onAddNew={() => setCreateModalOpen(true)}
                  />
                </div>
              </AnimateHeight>
            </>
          ) : null}
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
      {createModalOpen && (
        <TaxUnitCreateModal
          open={createModalOpen}
          onSuccess={function (unit): void {
            setSelectedTaxUnit(unit);
            setCreateModalOpen(false);
          }}
          onFailure={function (): void {
            setCreateModalOpen(false);
          }}
          onClose={() => setCreateModalOpen(false)}
        />
      )}
    </Lightbox>
  );
};

const successToast = () => toast.success("Lagret", { icon: <Check size={24} color={"black"} /> });
