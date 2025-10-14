"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const port = parseInt(process.env.PORT || "4001", 10);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/profiles", (req, res) => {
    return res.json({
        data: {
            name: "john",
            age: 20,
        },
    });
});
exports.default = app;
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server is running at ${port}`);
    });
}
//# sourceMappingURL=app.js.map