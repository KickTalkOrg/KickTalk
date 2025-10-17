import "../assets/styles/main.scss";
import "../assets/styles/dialogs/ReplyThreadDialog.scss";
import "../../../../utils/themeUtils";
import "../utils/i18n";

import React from "react";
import ReactDOM from "react-dom/client";
import ReplyThread from "../components/Dialogs/ReplyThread.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(<ReplyThread />);
