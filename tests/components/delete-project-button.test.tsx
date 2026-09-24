import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteProjectButton } from "@/components/delete-project-button";

describe("DeleteProjectButton", () => {
  it("affiche le bouton Supprimer", () => {
    render(<DeleteProjectButton />);
    expect(
      screen.getByRole("button", { name: /supprimer/i }),
    ).toBeInTheDocument();
  });

  it("appelle window.confirm au clic", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DeleteProjectButton />);
    await user.click(screen.getByRole("button", { name: /supprimer/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Supprimer ce projet ? Cette action est definitive.",
    );
    confirmSpy.mockRestore();
  });

  it("empêche la soumission si l'utilisateur annule", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={handleSubmit}>
        <DeleteProjectButton />
      </form>,
    );
    await user.click(screen.getByRole("button", { name: /supprimer/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
