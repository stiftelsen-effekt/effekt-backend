import { useState } from "react";
import { DocumentActionComponent, DocumentActionProps, DocumentActionsContext } from "sanity";

const sensitiveFields: Record<string, string[]> = {
  bank: ["kontonr"],
  autogiro: ["account_number"],
};

export const documentActions: (
  prev: DocumentActionComponent[],
  context: DocumentActionsContext,
) => DocumentActionComponent[] = (prev, context) => {
  const { schemaType } = context;

  if (sensitiveFields[schemaType]) {
    const publish = prev.find((item) => item.action === "publish");

    if (!publish) {
      return prev;
    }

    const prevWithoutPublish = prev.filter((item) => item.action !== "publish");

    const publishWrapper: DocumentActionComponent = (props: DocumentActionProps) => {
      const [dialogOpen, setDialogOpen] = useState(false);
      const publishAction = publish(props);

      if (!publishAction) {
        return null;
      }

      let sensitiveFieldsChanged = false;
      let changedFields: string[] = [];

      if (props.draft && props.published) {
        sensitiveFields[schemaType].forEach((field) => {
          const draftValue = getNestedValue(props.draft, field);
          const publishedValue = getNestedValue(props.published, field);
          if (draftValue !== publishedValue) {
            sensitiveFieldsChanged = true;
            changedFields.push(field);
          }
        });
      }

      return {
        ...publishAction,
        onHandle: () => {
          if (sensitiveFieldsChanged) {
            setDialogOpen(true);
          } else {
            publishAction.onHandle?.();
          }
        },
        dialog: dialogOpen && {
          type: "confirm",
          title: "Sensitive fields changed",
          message: `You have changed the following sensitive fields: ${changedFields.join(
            ", ",
          )}. This will notify the administrators for security reasons. Are you sure you want to publish?`,
          onCancel: () => setDialogOpen(false),
          // The administrators are notified by a signed Sanity webhook on publish (see
          // POST /mail/mailersend/security/sanitynotification in the API), so the notice can't
          // be skipped by publishing some other way
          onConfirm: () => {
            setDialogOpen(false);
            publishAction.onHandle?.();
          },
          color: "info",
        },
      };
    };

    return [publishWrapper, ...prevWithoutPublish];
  } else {
    return prev;
  }
};

function getNestedValue(obj: any, path: string) {
  return path.split(".").reduce((prev, curr) => prev && prev[curr], obj);
}
