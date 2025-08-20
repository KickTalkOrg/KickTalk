import "@assets/styles/main.scss";
import "@assets/styles/dialogs/Chatters.scss";
import "@utils/themeUtils";

import React from "react";
import ReactDOM from "react-dom/client";
import Chatters from "../components/Dialogs/Chatters";

ReactDOM.createRoot(document.getElementById("root")).render(<Chatters />);
