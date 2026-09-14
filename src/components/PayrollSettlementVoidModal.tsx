import { useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui-kit";
import { useApp } from "@/lib/session";
import { voidPayrollSettlement } from "@/lib/payroll-settlement";

interface Props {
  paymentId: string | null;
  open: boolean;
  onClose: () => void;
}

export function PayrollSettlementVoidModal({ paymentId, open, onClose }: Props) {
  const { actor } = useApp();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason("");
    setError(null);
    onClose();
  }

  function submit() {
    if (!paymentId) return;
    try {
      voidPayrollSettlement(paymentId, reason, actor);
      close();
    } catch (caught) {
      setError((caught as Error).message);
    }
  }

  return (
    <Modal open={open} title="إلغاء سند صرف راتب" onClose={close}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">إذا كان السند موزعًا على أكثر من شهر، سيُلغى السند كاملًا وتعود مبالغ كل شهر إلى رصيده الأصلي مع سجل تدقيق.</p>
        <Field label="سبب الإلغاء"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="السبب إلزامي..." /></Field>
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={close}>تراجع</Button><Button variant="danger" onClick={submit} disabled={!reason.trim()}>تأكيد الإلغاء</Button></div>
      </div>
    </Modal>
  );
}
