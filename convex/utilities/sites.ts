import { Doc } from "../_generated/dataModel";

// Below not used yet...
// export const ServiceToLoginURL: Record<Doc<"linkedServices">["service"], string> = {
//     "instagram": "https://www.instagram.com/accounts/login/",
// };

export function serviceToLoginURL(service: Doc<"linkedServices">["service"]) {
    switch (service) {
        case "instagram":
            return "https://www.instagram.com/accounts/login/"
        default:
            throw new Error(`Not implemented for ${service} yet`);
    }
}