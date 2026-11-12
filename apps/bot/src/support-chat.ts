import {
    sendTelegramAttachment,
    sendTelegramMessage,
    type TelegramAttachment,
} from "./telegram-client";

export type SupportDeliveryResult = {
    configured: boolean;
    summarySent: boolean;
    attachmentCount: number;
    sentAttachmentCount: number;
};

export async function sendToSupportChat(
    token: string,
    supportChatId: string | undefined,
    publicId: string,
    summary: string,
    attachments: TelegramAttachment[],
): Promise<SupportDeliveryResult> {
    if (!supportChatId?.trim()) {
        return { configured: false, summarySent: false, attachmentCount: attachments.length, sentAttachmentCount: 0 };
    }

    try {
        const result = await sendTelegramMessage(token, supportChatId.trim(), summary);
        if (!result.ok) {
            return { configured: true, summarySent: false, attachmentCount: attachments.length, sentAttachmentCount: 0 };
        }

        let sentAttachmentCount = 0;
        for (const attachment of attachments) {
            try {
                const label = attachment.kind === "photo" ? "Скриншот" : attachment.fileName;
                const mediaResult = await sendTelegramAttachment(
                    token,
                    supportChatId.trim(),
                    attachment,
                    `${publicId} · ${label}`,
                );
                if (mediaResult.ok) sentAttachmentCount += 1;
            } catch (error) {
                console.error("Telegram attachment delivery failed", {
                    publicId,
                    kind: attachment.kind,
                    error: error instanceof Error ? error.message : "unknown error",
                });
            }
        }

        return { configured: true, summarySent: true, attachmentCount: attachments.length, sentAttachmentCount };
    } catch (error) {
        console.error("Telegram support chat delivery failed", {
            publicId,
            error: error instanceof Error ? error.message : "unknown error",
        });
        return { configured: true, summarySent: false, attachmentCount: attachments.length, sentAttachmentCount: 0 };
    }
}
