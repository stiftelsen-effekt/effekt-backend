import styled from "styled-components";

export const InputFieldWrapper = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
`;

export const CheckBoxWrapper = styled.div`
  display: inline-flex;
  vertical-align: middle;
  margin-bottom: 12px;
  position: relative;
`;

export const HiddenCheckBox = styled.input`
  position: absolute;
  margin: 5px;
  margin-left: 0;
  width: 100%;
  height: 30px;
  opacity: 0;
  &:hover {
    cursor: pointer;
  }
  &:focus + span > div > span {
    outline: 2px solid var(--primary);
  }
  &:active + span > div > span {
    outline: none;
  }
`;
