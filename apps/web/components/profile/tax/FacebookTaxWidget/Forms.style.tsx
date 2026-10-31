import styled from "styled-components";
import { EffektButton } from "../../../shared/components/EffektButton/EffektButton";
import { Spinner } from "../../../shared/components/Spinner/Spinner";

export const InputFieldWrapper = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 24px;

  label {
    margin-bottom: 4px;
  }
`;

export const TaxInput = styled.input`
  background: none;
  border: 1px solid var(--primary);
  color: var(--primary);
  padding: 0.5em 1.2em;
  border-radius: 45px;
  font-size: 1em;
`;

export const LoadingButtonSpinner = styled(Spinner)`
  transform: scale(0.3);
  height: 20px;
  width: 20px;
  position: relative;
  top: -10px;
  left: -10px;
  transform-origin: center center;
  mix-blend-mode: difference;
`;

export const SubmitButton = styled(EffektButton)`
  min-width: 160px;
  max-width: 160px;
  min-height: 37.5px
  align-self: flex-end;
`;
