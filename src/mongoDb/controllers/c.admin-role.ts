import { Request, Response } from "express";
import { User } from "../schemas/sch.userProfile";
export const handleUsers = async (req: Request, res: Response) => {
  try {
    const { search = "", role = "all", page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter: any = {};
    if (search) {
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { address: { $regex: search, $options: "i" } }];
    }

    if (role && role !== "all") filter.role = role;

    const users = await User.find(filter).populate("profile").skip(skip).limit(Number(limit)).lean();

    const total = await User.countDocuments(filter);
    res.status(200).json({ data: users, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};
export const handleChangeUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role: newRole, adminUser } = req.body;

    const SUPER_ADMIN = "0x66eF7c7e986F0D19F106CF9cCE0D434329DF4440";

    if (!adminUser) {
      return res.status(400).json({ message: "Admin address required" });
    }

    const normalizedAddress = adminUser.toLowerCase();
    const isSuperAdmin = normalizedAddress === SUPER_ADMIN.toLowerCase();

    // 🔐 Get requesting user
    const admin = await User.findOne({ address: normalizedAddress });

    if (!admin && !isSuperAdmin) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // 🔎 Target user
    const userToUpdate = await User.findById(id);
    if (!userToUpdate) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔐 Only admin or super admin allowed
    if (!isSuperAdmin && admin?.role !== "admin") {
      return res.status(403).json({
        message: "Only admin can change roles",
      });
    }

    // 🚫 Admin restrictions
    if (!isSuperAdmin) {
      // ❌ Cannot modify another admin
      if (userToUpdate.role === "admin") {
        return res.status(403).json({
          message: "Only super admin can modify admin roles",
        });
      }

      // ❌ Cannot promote to admin
      if (newRole === "admin") {
        return res.status(403).json({
          message: "Only super admin can assign admin role",
        });
      }

      // ❌ Cannot remove own admin role
      if (admin?._id.toString() === id && newRole !== "admin") {
        return res.status(400).json({
          message: "You cannot remove your own admin role",
        });
      }
    }

    // 🚫 Protect super admin role
    if (userToUpdate.address?.toLowerCase() === SUPER_ADMIN && newRole !== "admin") {
      return res.status(400).json({
        message: "Cannot change super admin role",
      });
    }

    // ✅ Apply role update
    userToUpdate.role = newRole;
    await userToUpdate.save();

    return res.status(200).json({
      success: true,
      role: userToUpdate.role,
    });
  } catch (err) {
    console.error("handleChangeUserRole error:", err);
    return res.status(500).json({ message: "Failed to update role" });
  }
};
