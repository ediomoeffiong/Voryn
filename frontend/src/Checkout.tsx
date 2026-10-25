import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  CreditCard,
  Ticket as TicketIcon,
  Copy,
  Check,
  Share2,
  ExternalLink,
  ArrowRight,
  AlertCircle
} from "lucide-react";
import { initializeCheckout, verifyPayment } from "./api";
import type { Event, TicketOrder, User } from "./types";

export function CheckoutModal({
  event,
  user,
  initialTicketTypeId,
  onClose
}: {
  event: Event;
  user: User | null;
  initialTicketTypeId?: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const availableTickets = (event.tickets || []).filter(
    (t) => t.visibility === "public" && t.availability === "available" && (t.capacity == null || (t.reservedCount ?? 0) < t.capacity)
  );

  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    if (initialTicketTypeId) {
      initial[initialTicketTypeId] = 1;
    } else if (availableTickets.length > 0) {
      initial[availableTickets[0].id || availableTickets[0].name] = 1;
    }
    return initial;
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const updateQuantity = (ticketId: string, delta: number, min = 1, max = 10) => {
    setQuantities((prev) => {
      const current = prev[ticketId] || 0;
      const next = Math.max(0, Math.min(current + delta, max));
      return { ...prev, [ticketId]: next };
    });
  };

  const selectedItems = availableTickets
    .map((ticket) => {
      const key = ticket.id || ticket.name;
      const qty = quantities[key] || 0;
      return { ticket, quantity: qty };
    })
    .filter((item) => item.quantity > 0);

  const totalItemsCount = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalMinor = selectedItems.reduce(
    (sum, item) => sum + (item.ticket.priceMinor || 0) * item.quantity,
    0
  );
  const currency = availableTickets[0]?.currency || "NGN";

  const handleCheckout = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (totalItemsCount === 0) {
      setErrorMessage("Please select at least 1 ticket to proceed.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");

    try {
      const itemsPayload = selectedItems.map((item) => ({
        ticketTypeId: item.ticket.id || item.ticket.name,
        quantity: item.quantity
      }));

      const callbackUrl = `${window.location.origin}/checkout/callback`;

      const result = await initializeCheckout({
        eventSlug: event.slug,
        items: itemsPayload,
        callbackUrl
      });

      // Redirect to Paystack secure checkout
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      } else {
        throw new Error("Payment gateway did not provide a redirect URL.");
      }
    } catch (error) {
      setIsProcessing(false);
      setErrorMessage(error instanceof Error ? error.message : "Payment initialization failed");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card checkout-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">SECURE CHECKOUT</span>
            <h2 id="checkout-title">{event.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close checkout">
            &times;
          </button>
        </header>

        <div className="checkout-body">
          {errorMessage ? (
            <div className="alert-box error" role="alert">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <section className="ticket-tier-selection">
            <h3>Select Ticket Category</h3>
            {availableTickets.length === 0 ? (
              <p className="empty-state">No paid ticket categories are currently available for purchase.</p>
            ) : (
              availableTickets.map((ticket) => {
                const key = ticket.id || ticket.name;
                const qty = quantities[key] || 0;
                const max = ticket.maxPerOrder || 10;
                const priceFormatted = ticket.priceMinor
                  ? `${ticket.currency} ${(ticket.priceMinor / 100).toLocaleString(undefined, {
                      minimumFractionDigits: 2
                    })}`
                  : "Free";

                return (
                  <div key={key} className={`ticket-select-row ${qty > 0 ? "selected" : ""}`}>
                    <div className="ticket-info">
                      <strong>{ticket.name}</strong>
                      <span className="ticket-price">{priceFormatted}</span>
                      {ticket.description ? <p>{ticket.description}</p> : null}
                      <small className="availability">
                        {ticket.capacity
                          ? `${Math.max(0, ticket.capacity - (ticket.reservedCount || 0))} tickets available`
                          : "General inventory"}
                      </small>
                    </div>
                    <div className="quantity-controls">
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={qty <= 0 || isProcessing}
                        onClick={() => updateQuantity(key, -1, 0, max)}
                        aria-label={`Decrease ${ticket.name} quantity`}
                      >
                        -
                      </button>
                      <span className="qty-number" aria-live="polite">
                        {qty}
                      </span>
                      <button
                        type="button"
                        className="qty-btn"
                        disabled={qty >= max || isProcessing}
                        onClick={() => updateQuantity(key, 1, 0, max)}
                        aria-label={`Increase ${ticket.name} quantity`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <section className="order-summary-panel">
            <h3>Order Summary</h3>
            <div className="summary-line">
              <span>Selected Tickets</span>
              <span>{totalItemsCount}</span>
            </div>
            <div className="summary-line">
              <span>Subtotal</span>
              <span>
                {currency}{" "}
                {(subtotalMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="summary-line total">
              <strong>Total Amount Due</strong>
              <strong>
                {currency}{" "}
                {(subtotalMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </div>
          </section>

          <footer className="checkout-footer">
            <div className="payment-security-notice">
              <Shield size={16} />
              <span>Verified 256-bit encrypted payment via Paystack</span>
            </div>
            <button
              className="primary full-width pay-btn"
              disabled={isProcessing || totalItemsCount === 0}
              onClick={handleCheckout}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={18} className="spinner" /> Initializing Paystack Checkout...
                </>
              ) : (
                <>
                  <CreditCard size={18} /> Pay {currency}{" "}
                  {(subtotalMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </>
              )}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

export function CheckoutCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reference = searchParams.get("reference") || searchParams.get("trxref") || "";

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [ticket, setTicket] = useState<{ id: string; displayCode: string } | null>(null);

  useEffect(() => {
    if (!reference) {
      setLoading(false);
      setError("No transaction reference provided in payment callback.");
      return;
    }

    let isMounted = true;

    async function verify() {
      try {
        const res = await verifyPayment(reference);
        if (!isMounted) return;

        if (res.success && res.order) {
          setSuccess(true);
          setOrder(res.order);
          if (res.ticket) setTicket(res.ticket);
        } else {
          setSuccess(false);
          setError(res.message || "Payment verification failed. Your card was not charged.");
        }
      } catch (err) {
        if (!isMounted) return;
        setSuccess(false);
        setError(err instanceof Error ? err.message : "Verification error occurred");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    verify();
    return () => {
      isMounted = false;
    };
  }, [reference]);

  if (loading) {
    return (
      <main className="callback-page container">
        <div className="callback-card">
          <Loader2 size={48} className="spinner accent" />
          <h2>Verifying Your Payment...</h2>
          <p>Contacting Paystack payment gateway to verify your transaction.</p>
          <small className="mono">Reference: {reference}</small>
        </div>
      </main>
    );
  }

  if (!success) {
    return (
      <main className="callback-page container">
        <div className="callback-card error">
          <XCircle size={52} className="error-icon" />
          <h2>Payment Unsuccessful</h2>
          <p>{error}</p>
          <div className="action-buttons">
            <Link to="/search" className="button secondary">
              Browse Other Events
            </Link>
            <button onClick={() => window.history.back()} className="button primary">
              Retry Payment
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="callback-page container">
      <div className="callback-card success">
        <CheckCircle2 size={56} className="success-icon" />
        <span className="eyebrow">TRANSACTION CONFIRMED</span>
        <h2>You&apos;re Going to the Event!</h2>
        <p>Your payment has been verified and your ticket credentials have been issued.</p>

        {order ? (
          <div className="confirmed-receipt-panel">
            <div className="receipt-row">
              <span>Order Number</span>
              <strong>#{order.orderNumber}</strong>
            </div>
            <div className="receipt-row">
              <span>Amount Paid</span>
              <strong>
                {order.currency}{" "}
                {(order.totalMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </div>
            {ticket ? (
              <div className="receipt-row highlight">
                <span>Ticket Code</span>
                <span className="ticket-badge">{ticket.displayCode}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="action-buttons">
          <Link to="/dashboard/participant" className="button primary">
            <TicketIcon size={18} /> View Ticket in Wallet
          </Link>
          <Link to={`/events/${order?.eventSlug}`} className="button secondary">
            Back to Event Page <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </main>
  );
}

export function SocialShareModal({
  event,
  onClose
}: {
  event: Event;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/events/${event.slug}`;
  const shareText = `Join me at ${event.title} on Voryn!`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.title,
          text: event.summary,
          url: shareUrl
        });
      } catch {
        // User dismissed
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card share-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">SPREAD THE WORD</span>
            <h2>Share Event</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close share dialog">
            &times;
          </button>
        </header>

        <div className="share-body">
          <p className="share-event-title">{event.title}</p>

          <div className="copy-url-bar">
            <input type="text" readOnly value={shareUrl} />
            <button className="button secondary" onClick={copyToClipboard}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="social-links-grid">
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn whatsapp"
            >
              WhatsApp
            </a>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn twitter"
            >
              X (Twitter)
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn facebook"
            >
              Facebook
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn linkedin"
            >
              LinkedIn
            </a>
          </div>

          {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
            <button className="button primary full-width native-share-btn" onClick={nativeShare}>
              <Share2 size={16} /> More Share Options...
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
