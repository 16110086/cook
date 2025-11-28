import { toast } from "sonner";
import { logger } from "./logger";

const toastStyle = {
  className: "font-mono lowercase",
};

// Wrapper functions for toast
export const toastWithSound = {
  success: (message: string, data?: any) => {
    const msg = message.toLowerCase();
    logger.success(msg);
    return toast.success(msg, { ...toastStyle, ...data });
  },

  error: (message: string, data?: any) => {
    const msg = message.toLowerCase();
    logger.error(msg);
    return toast.error(msg, { ...toastStyle, ...data });
  },

  warning: (message: string, data?: any) => {
    const msg = message.toLowerCase();
    logger.warning(msg);
    return toast.warning(msg, { ...toastStyle, ...data });
  },

  info: (message: string, data?: any) => {
    const msg = message.toLowerCase();
    logger.info(msg);
    return toast.info(msg, { ...toastStyle, ...data });
  },

  message: (message: string, data?: any) => {
    const msg = message.toLowerCase();
    logger.info(msg);
    return toast(msg, { ...toastStyle, ...data });
  },
};
