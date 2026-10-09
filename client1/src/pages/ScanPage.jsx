export default function ScanPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const fromRoute =
    state?.scan?.id === id
      ? state.scan
      : null;

  const [scan, setScan] = useState(fromRoute);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (fromRoute) {
      setScan(fromRoute);
      return undefined;
    }

    let alive = true;

    setScan(null);
    setError(null);

    api
      .getScan(id)
      .then((s) => {
        if (alive) setScan(s);
      })
      .catch((e) => {
        if (alive) setError(e);
      });

    return () => {
      alive = false;
    };
  }, [id, fromRoute, attempt]);

  if (error) {
    return (
      <div className="error-box" role="alert">
        <p>
          {error.status === 404
            ? "We couldn't find that scan."
            : error.message}
        </p>

        <div className="row">
          {error.retryable && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                setAttempt((n) => n + 1)
              }
            >
              Try again
            </button>
          )}

          <Link
            className="btn"
            to="/history"
          >
            Back to history
          </Link>
        </div>
      </div>
    );
  }

  if (!scan) {
    return (
      <p
        className="center"
        role="status"
      >
        <span
          className="spinner"
          aria-hidden="true"
        />
        Loading scan…
      </p>
    );
  }

  return (
    <ResultCard
      scan={scan}
      onRetake={() => navigate('/')}
      onFeedbackSaved={(updated) =>
        setScan((s) => ({
          ...s,
          feedback: updated.feedback,
        }))
      }
    />
  );
}