import styled from "styled-components";

export const Pane = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  white-space: normal;

  font-size: 18px;
  line-height: 30px;

  @media only screen and (max-width: 768px) {
    font-size: 20px;
    line-height: 30px;
  }
`;

export const PaneContainer = styled.div`
  padding: 0;
  min-height: 500px;
  display: grid;
  grid-template-rows: 1fr max-content;
  height: 100%;
  padding-bottom: 20px;
  padding-left: 40px;
  padding-right: 40px;
`;

export const PaneTitle = styled.h2`
  font-family: "ESKlarheitKurrent";
  font-size: 27px;
  margin-top: 0px;
  margin-top: 20px;
  margin-bottom: 20px;
  line-height: normal;
`;

export const CenterDiv = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
`;
