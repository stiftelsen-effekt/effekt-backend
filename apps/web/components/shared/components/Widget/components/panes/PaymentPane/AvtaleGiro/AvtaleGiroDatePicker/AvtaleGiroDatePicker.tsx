import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setDueDay } from "../../../../../store/donation/actions";
import { State } from "../../../../../store/state";
import { DatePicker } from "../../../../shared/DatePicker/DatePicker";
import { ToolTip } from "../../../../shared/ToolTip/ToolTip";
import { isIrregularChargeDay } from "./avtalegirodates";
import { DatePickerInputConfiguration } from "../../../../../../DatePicker/DatePickerInput";
import { Dispatch } from "@reduxjs/toolkit";
import { DonationActionTypes } from "../../../../../store/donation/types";
import payment from "../../PaymentPane.module.scss";

const tooltipText =
  "Vi må av tekniske grunner melde inn trekk til bankene tidligere enn din valgte trekkdato, derfor utsettes første trekk med én måned. Du kan velge en annen trekkdato om du ønsker å trekkes tidligere.";

export const AvtaleGiroDatePicker: React.FC<{ configuration: DatePickerInputConfiguration }> = ({
  configuration,
}) => {
  const dispatch = useDispatch<Dispatch<DonationActionTypes>>();
  const dueDay = useSelector((state: State) => state.donation.dueDay);
  const [selectedDueDay, setSelectedDueDay] = useState<number>(dueDay);

  useEffect(() => {
    dispatch(setDueDay(selectedDueDay));
  }, [selectedDueDay, dispatch]);

  return (
    <div className={payment.datePickerWrapper}>
      <div className={payment.dateTextWrapper}>
        <p className={payment.dateText}>
          {dueDay === 0
            ? configuration.payment_date_last_day_of_month_template
            : configuration.payment_date_format_template.replace("{{date}}", dueDay.toString())}
        </p>
        {isIrregularChargeDay(selectedDueDay) && <ToolTip text={tooltipText} />}
      </div>
      <div className={payment.dateBoxWrapper}>
        <DatePicker
          selected={dueDay}
          onChange={(date) => {
            setSelectedDueDay(date);
          }}
          onClickOutside={() => {}}
          configuration={configuration}
        />
      </div>
    </div>
  );
};
