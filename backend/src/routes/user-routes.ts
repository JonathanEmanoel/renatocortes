import { Router } from "express";
import { UserController } from "../controllers/user-controller.js";

const userRoutes = Router();
const userController = new UserController();

userRoutes.get("/users", (request, response) => userController.index(request, response));

export { userRoutes };
