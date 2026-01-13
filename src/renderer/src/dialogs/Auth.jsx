import "../assets/styles/main.scss";
import "../../../../utils/themeUtils";
import "../utils/i18n";

import React from "react";
import ReactDOM from "react-dom/client";
import Auth from "../components/Dialogs/Auth";

ReactDOM.createRoot(document.getElementById("root")).render(<Auth />);
