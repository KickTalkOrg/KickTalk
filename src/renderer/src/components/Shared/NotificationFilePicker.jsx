"use client";
import { useState, useEffect } from "react";
const NotificationFilePicker = ({ getOptions, change, settingsData }) => {
  const [options, setOptions] = useState([]);
  const [value, setValue] = useState("default");

  useEffect(() => {
    const fetchOptions = async () => {
      const initialOptions = await getOptions();
      setOptions(initialOptions);
    };
    fetchOptions();
  }, [getOptions]);

  useEffect(() => {
    if (settingsData?.notifications?.soundFile) {
      setValue(settingsData.notifications.soundFile);
    } else {
      setValue("default");
    }
  });

  const handleFocus = async () => {
    const newOptions = await getOptions();
    setOptions(newOptions);
    console.log("Options updated:", newOptions);
  };

  const handleChange = (e) => {
    setValue(e.target.value);
    console.log("Selected value:", e.target.value);
    change("notifications", {
      ...settingsData?.notifications,
      soundFile: e.target.value,
    });
  };

  return (
    <select className="timestampFormat" value={value} onChange={handleChange} onFocus={handleFocus}>
      {options.map((opt) => (
        <option key={opt.label} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export default NotificationFilePicker;
