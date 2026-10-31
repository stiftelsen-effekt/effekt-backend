import { useAuth0 } from "@auth0/auth0-react";
import { useTrpcClient } from "../../../../lib/trpc/useTrpcClient";
import { useContext, useState } from "react";
import { AlertCircle, Check } from "react-feather";
import { toast } from "react-toastify";
import { Donor } from "../../../../models";
import style from "./ProfileInfo.module.scss";
import { DonorContext } from "../../layout/donorProvider";
import { saveDonor } from "../../_queries";
import { EffektButton } from "../../../shared/components/EffektButton/EffektButton";
import { EffektCheckbox } from "../../../shared/components/EffektCheckbox/EffektCheckbox";
import { ErrorMessage } from "../../shared/ErrorMessage/ErrorMessage";
import { useMainLocale } from "../../../../context/MainLocaleContext";
import { isProcedureAvailable } from "../../../../lib/trpc/client";

export type ProfilePageInfoConfiguration = {
  name_label: string;
  email_label: string;
  newsletter_label: string;
  save_button_label: string;
  success_message: string;
  failure_message: string;
};

export const ProfileInfo: React.FC<{
  config: ProfilePageInfoConfiguration;
  titleTemplate: string;
}> = ({ config, titleTemplate }) => {
  const { getAccessTokenSilently, user } = useAuth0();
  const trpc = useTrpcClient(getAccessTokenSilently);
  // The Danish backend has no route for saving the profile, so it is shown read-only there
  const editable = isProcedureAvailable(useMainLocale(), "minside.updateProfile");

  const { donor: initialDonor, setDonor: setGlobalDonor } = useContext(DonorContext);
  const [editedDonor, setDonor] = useState<Donor | null>(initialDonor);
  // Fall back to the donor from context until it has loaded and been edited locally
  const donor = editedDonor ?? initialDonor;

  if (!donor || !user) return <ErrorMessage />;

  const save = async () => {
    const result = await saveDonor(donor, user, trpc);
    if (result === null) {
      failureToast(config.failure_message);
    } else {
      successToast(config.success_message);
      setGlobalDonor(donor);
    }
  };

  return (
    <>
      <h3 className={style.header}>
        {titleTemplate.replace("{{name}}", donor.name ? " " + donor.name.split(" ")[0] : "")}
      </h3>
      <section className={style.personalInfo}>
        <div className={style.inputContainer}>
          {config.name_label}
          <input
            id="name"
            type="text"
            defaultValue={donor.name ?? undefined}
            disabled={!editable}
            className={style.input}
            onChange={(e) => {
              setDonor({ ...donor, name: e.target.value });
            }}
          />
        </div>
        <div className={style.inputContainer}>
          {config.email_label}
          <input id="email" type="email" disabled value={donor.email} className={style.input} />
        </div>
        {editable && (
          <>
            <div className={style.inputContainer}>
              <EffektCheckbox
                dataCy="checkbox-newsletter"
                checked={donor.newsletter}
                onChange={() => {
                  setDonor({ ...donor, newsletter: !donor.newsletter });
                }}
              >
                {config.newsletter_label}
              </EffektCheckbox>
            </div>
            <EffektButton role={"submit"} onClick={save} cy="btn-save">
              {config.save_button_label}
            </EffektButton>
          </>
        )}
      </section>
    </>
  );
};

const successToast = (msg: string) =>
  toast.success(msg, { icon: <Check size={24} color={"black"} /> });
const failureToast = (msg: string) =>
  toast.error(msg, { icon: <AlertCircle size={24} color={"black"} /> });
